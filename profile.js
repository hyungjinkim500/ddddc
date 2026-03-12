import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { storage } from "./firebase-config.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { compressImage } from "./image-compress.js";


const changePhotoBtn = document.getElementById("change-photo-btn");
const profileUpload = document.getElementById("profile-upload");

if (changePhotoBtn && profileUpload) {

    changePhotoBtn.addEventListener("click", () => {
        profileUpload.click();
    });

}

profileUpload.addEventListener("change", async (event) => {

    const file = event.target.files[0];
    if (!file) return;

    const MAX_SIZE = 3 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
      alert("프로필 사진은 3MB 이하만 업로드 가능합니다.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드 가능합니다.");
      return;
    }

    const user = auth.currentUser;

    if (!user) {
        alert("로그인이 필요합니다.");
        return;
    }

    try {

        const compressedFile = await compressImage(file);

        const storageRef = ref(storage, "profileImages/" + user.uid + "/profile.jpg");

        await uploadBytes(storageRef, compressedFile);

        const downloadURL = await getDownloadURL(storageRef);

        const userRef = doc(db, "userProfiles", user.uid);

        await updateDoc(userRef, {
            photoURL: downloadURL
        });

        const profileImage = document.getElementById("profile-image");
        if (profileImage) {
            profileImage.src = downloadURL;
        }

        localStorage.setItem("userAvatar", downloadURL);

        alert("프로필 사진이 변경되었습니다.");

    } catch (error) {

        console.error("Profile upload error:", error);
        alert("사진 업로드 중 오류가 발생했습니다.");

    }

});
