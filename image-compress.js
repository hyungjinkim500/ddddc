export async function compressImage(file, maxWidth = 512, quality = 0.8) {

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.readAsDataURL(file);

    reader.onload = (event) => {

      const img = new Image();

      img.src = event.target.result;

      img.onload = () => {

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = height * (maxWidth / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            resolve(blob);
          },
          "image/jpeg",
          quality
        );
      };

      img.onerror = reject;

    };

    reader.onerror = reject;

  });

}