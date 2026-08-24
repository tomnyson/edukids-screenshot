export const fetchImage = async (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ScreenCaptureDB', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('images');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('images', 'readonly');
      const storeRequest = tx.objectStore('images').get('overlay');
      storeRequest.onsuccess = () => {
        db.close();
        resolve(storeRequest.result);
      };
      storeRequest.onerror = () => reject(storeRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
};
