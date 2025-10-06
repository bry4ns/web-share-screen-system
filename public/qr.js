// Generador QR usando QRious (librería local)
function generateQRCode(url, size = 180) {
    const img = document.createElement('img');
    // QRious necesita estar cargado
    if (window.QRious) {
        const qr = new window.QRious({
            value: url,
            size: size,
            background: 'white',
            foreground: '#7c3aed', // morado
            level: 'H'
        });
        img.src = qr.toDataURL();
    } else {
        img.alt = 'No se pudo generar el QR';
    }
    img.className = 'mx-auto my-2 rounded-lg border-2 border-purple-400 bg-white';
    img.width = size;
    img.height = size;
    return img;
}
