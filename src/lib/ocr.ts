export async function performOCR(imageBase64: string): Promise<string> {
  const apiKey = process.env.OCR_SPACE_API_KEY || 'helloworld';

  const formData = new FormData();
  formData.append('base64Image', `data:image/png;base64,${imageBase64}`);
  formData.append('language', 'chs');
  formData.append('isOverlayRequired', 'false');
  formData.append('OCREngine', '2');
  formData.append('scale', 'true');

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: apiKey },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OCR API returned ${response.status}`);
  }

  const result = await response.json();

  if (result.ParsedResults && result.ParsedResults.length > 0) {
    return result.ParsedResults[0].ParsedText || '';
  }

  throw new Error(result.ErrorMessage?.[0] || 'OCR failed');
}
