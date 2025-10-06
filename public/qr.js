// Generador QR simple usando Google Chart API
function generateQRCode(url, size = 180) {
    // Devuelve un elemento <img> con el QR
    const qr = document.createElement('img');
    qr.src = `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(url)}`;
    qr.alt = 'QR de la transmisión';
    qr.className = 'mx-auto my-2 rounded-lg border-2 border-purple-400 bg-white';
    qr.width = size;
    qr.height = size;
    return qr;
}
