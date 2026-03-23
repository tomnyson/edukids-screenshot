export const storeImage = async (dataUrl: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ScreenCaptureDB', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('images');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').put(dataUrl, 'overlay');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
};

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
