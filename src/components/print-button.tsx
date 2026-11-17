'use client';
export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="primary">
      Imprimir / salvar PDF
    </button>
  );
}
