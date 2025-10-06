// Generador QR usando QRious (librería local)
// Generador QR usando qrcodejs (librería local)
function generateQRCode(url, size = 180) {
    // Crear un contenedor temporal
    const container = document.createElement('div');
    // Limpiar el contenedor por si acaso
    container.innerHTML = '';
    // Crear el QR
    new window.QRCode(container, {
        text: url,
        width: size,
        height: size,
        colorDark: '#7c3aed', // morado
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
    });
    // Obtener el canvas o img generado
    const qrElement = container.querySelector('canvas, img');
    if (qrElement) {
        qrElement.className = 'mx-auto my-2 rounded-lg border-2 border-purple-400 bg-white';
        qrElement.width = size;
        qrElement.height = size;
        return qrElement;
    } else {
        const fallback = document.createElement('img');
        fallback.alt = 'No se pudo generar el QR';
        return fallback;
    }
}
