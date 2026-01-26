declare module 'jspdf' {
  export class jsPDF {
    constructor(options?: {
      orientation?: 'portrait' | 'landscape';
      unit?: 'mm' | 'pt' | 'cm' | 'in';
      format?: string | [number, number];
    });
    addPage(): void;
    addImage(
      imageData: string | HTMLImageElement | HTMLCanvasElement,
      format: string,
      x: number,
      y: number,
      width: number,
      height: number
    ): void;
    save(filename: string): void;
  }
}
