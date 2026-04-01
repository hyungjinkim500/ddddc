const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
setGlobalOptions({ maxInstances: 10 });

exports.deleteUserData = onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

    const db = getFirestore();

    // 1. 내 게시글 + 서브컬렉션 삭제
    const myPosts = await db.collection("questions").where("creatorId", "==", uid).get();
    for (const postDoc of myPosts.docs) {
        const postId = postDoc.id;
        const comments = await db.collection("questions").doc(postId).collection("comments").get();
        for (const c of comments.docs) {
            const replies = await db.collection("questions").doc(postId).collection("comments").doc(c.id).collection("replies").get();
            for (const r of replies.docs) await r.ref.delete();
            await c.ref.delete();
        }
        const likes = await db.collection("questions").doc(postId).collection("likes").get();
        for (const d of likes.docs) await d.ref.delete();
        const votes = await db.collection("questions").doc(postId).collection("userVotes").get();
        for (const d of votes.docs) await d.ref.delete();
        await postDoc.ref.delete();
    }

    // 2. 다른 게시글에서 내 투표/좋아요/댓글 삭제
    const allPosts = await db.collection("questions").get();
    for (const postDoc of allPosts.docs) {
        const postId = postDoc.id;
        const postData = postDoc.data();

        // 투표 삭제 + vote 카운트 감소
        const userVoteRef = db.collection("questions").doc(postId).collection("userVotes").doc(uid);
        const userVoteSnap = await userVoteRef.get();
        if (userVoteSnap.exists) {
            const selectedOption = userVoteSnap.data().selectedOption;
            const updateFields = { participants: require("firebase-admin/firestore").FieldValue.arrayRemove(uid) };
            if (selectedOption && postData.vote?.[selectedOption] > 0) {
                updateFields[`vote.${selectedOption}`] = require("firebase-admin/firestore").FieldValue.increment(-1);
            }
            await db.collection("questions").doc(postId).update(updateFields);
            await userVoteRef.delete();
        }

        // 좋아요 삭제 + likesCount 감소
        const likeRef = db.collection("questions").doc(postId).collection("likes").doc(uid);
        const likeSnap = await likeRef.get();
        if (likeSnap.exists) {
            await db.collection("questions").doc(postId).update({
                likesCount: require("firebase-admin/firestore").FieldValue.increment(-1)
            });
            await likeRef.delete();
        }

        // 댓글/답글 삭제 + commentsCount 감소
        const allComments = await db.collection("questions").doc(postId).collection("comments").get();
        let deletedCount = 0;
        for (const c of allComments.docs) {
            if (c.data().uid === uid) {
                const replies = await c.ref.collection("replies").get();
                deletedCount += 1 + replies.size;
                for (const r of replies.docs) await r.ref.delete();
                await c.ref.delete();
            } else {
                const replies = await c.ref.collection("replies").get();
                for (const r of replies.docs) {
                    if (r.data().uid === uid) { await r.ref.delete(); deletedCount++; }
                }
            }
        }
        if (deletedCount > 0) {
            await db.collection("questions").doc(postId).update({
                commentsCount: require("firebase-admin/firestore").FieldValue.increment(-deletedCount)
            });
        }
    }

    // 3. allComments 삭제
    const allComments = await db.collection("allComments").where("uid", "==", uid).get();
    for (const d of allComments.docs) await d.ref.delete();

    // 4. userProfiles 삭제
    await db.collection("userProfiles").doc(uid).delete();

    // 5. Auth 계정 삭제
    await getAuth().deleteUser(uid);

    return { success: true };
});

exports.getPostOg = onRequest({ maxInstances: 5 }, async (req, res) => {
    const postId = req.query.id;
    if (!postId) {
        res.redirect('https://pixkorea.com/post.html');
        return;
    }

    try {
        const db = getFirestore();
        const postSnap = await db.collection("questions").doc(postId).get();

        if (!postSnap.exists) {
            res.redirect(`https://pixkorea.com/post.html?id=${postId}`);
            return;
        }

        const post = postSnap.data();
        const title = post.title || '픽스';
        const description = post.description || '집단지성 플랫폼 픽스에서 투표에 참여해보세요!';
        const imageUrl = (post.imageUrls && post.imageUrls[0]) || 'https://pixkorea.com/pix_logo_nobackground.png';
        const pageUrl = `https://pixkorea.com/post.html?id=${postId}`;

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title} | 픽스</title>
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="픽스 PIX">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${imageUrl}">
    <meta http-equiv="refresh" content="0;url=${pageUrl}">
</head>
<body>
    <script>window.location.replace('${pageUrl}');</script>
</body>
</html>`;

        res.set('Cache-Control', 'public, max-age=300');
        res.status(200).send(html);
    } catch (e) {
        console.error('getPostOg error:', e);
        res.redirect(`https://pixkorea.com/post.html?id=${postId}`);
    }
});
