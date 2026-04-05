export async function performOCR(imageBase64: string): Promise<string> {
  const apiKey = process.env.OCR_SPACE_API_KEY || 'helloworld';

  // Try Engine 2 first (better for handwriting), fall back to Engine 1
  for (const engine of ['2', '1']) {
    try {
      const formData = new FormData();
      formData.append('base64Image', `data:image/jpeg;base64,${imageBase64}`);
      formData.append('language', 'chs');
      formData.append('isOverlayRequired', 'false');
      formData.append('OCREngine', engine);
      formData.append('scale', 'true');
      formData.append('isTable', 'false');

      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { apikey: apiKey },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const result = await response.json();

      if (result.IsErroredOnProcessing) {
        const msg = result.ErrorMessage?.join('; ') || 'Processing error';
        if (engine === '2') continue; // try Engine 1
        throw new Error(msg);
      }

      if (result.ParsedResults && result.ParsedResults.length > 0) {
        const text = result.ParsedResults[0].ParsedText?.trim();
        if (text) return text;
        if (engine === '2') continue; // empty result, try Engine 1
      }
    } catch (e) {
      if (engine === '1') throw e; // both engines failed
    }
  }

  throw new Error('Could not recognize text in the image. Please try a clearer photo or type your text.');
}
