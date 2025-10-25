import { type UploadProgressHandler } from '../components/forms';

export async function readFileAsText(
  file: File,
  onProgress?: UploadProgressHandler,
  encoding: string = 'utf-8',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reader.abort();
      reject(new Error('Não foi possível ler o arquivo selecionado.'));
    };

    reader.onabort = () => {
      reject(new Error('Leitura do arquivo cancelada.'));
    };

    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      if (result instanceof ArrayBuffer) {
        resolve(new TextDecoder(encoding).decode(result));
        return;
      }
      reject(new Error('Formato de arquivo não suportado.'));
    };

    reader.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) {
        return;
      }
      const percentage = (event.loaded / event.total) * 100;
      onProgress(Number.isFinite(percentage) ? Math.round(percentage) : 0);
    };

    reader.readAsText(file, encoding);
  });
}
