const video = document.getElementById('videoEl');
const canvas = document.getElementById('overlay');
const confirmation = document.getElementById('confirmation');
const ctx = canvas.getContext('2d');

async function start() {
  console.log("🟡 carregando modelos…");
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('./models')
  ]);
  console.log("✅ modelos carregados");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    video.srcObject = stream;
    console.log("📷 câmera iniciada");
  } catch (err) {
    console.error("❌ erro câmera:", err);
    return;
  }

  video.addEventListener('playing', () => {
    console.log("▶ vídeo playing — iniciando detecção");

    // ajusta canvas ao tamanho real do vídeo
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;

    let blinkCounter = 0;
    const EAR_THRESHOLD = 0.25;
    const EAR_CONSEC_FRAMES = 2;
    let eyesClosed = false;

    setInterval(async () => {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!detection) {
        if (eyesClosed) {
          // reset se rosto some
          blinkCounter = 0;
          eyesClosed = false;
        }
        return;
      }

      // desenha detecção e landmarks
      const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
      faceapi.draw.drawDetections(canvas, resized);
      faceapi.draw.drawFaceLandmarks(canvas, resized);

      const lm = detection.landmarks;
      const leftEAR  = getEAR(lm.getLeftEye());
      const rightEAR = getEAR(lm.getRightEye());
      const avgEAR   = (leftEAR + rightEAR) / 2;

      // detectar fechar
      if (!eyesClosed && avgEAR < EAR_THRESHOLD) {
        blinkCounter++;
        if (blinkCounter >= EAR_CONSEC_FRAMES) {
          eyesClosed = true;
          console.log("👁️‍🗨️ olhos fechados (EAR=", avgEAR.toFixed(3), ")");
        }
      }

      // detectar abrir após fechado
      if (eyesClosed && avgEAR >= EAR_THRESHOLD) {
        console.log("👁️ olhos abertos (EAR=", avgEAR.toFixed(3), ") → Piscada!");
        confirmation.innerText = '✅ Piscou!';
        setTimeout(() => confirmation.innerText = '', 800);
        // reset
        eyesClosed = false;
        blinkCounter = 0;
      }
    }, 100);
  });
}

function getEAR(eye) {
  const [p1,p2,p3,p4,p5,p6] = eye;
  const a = distance(p2, p6);
  const b = distance(p3, p5);
  const c = distance(p1, p4);
  return (a + b) / (2 * c);
}

function distance(pA, pB) {
  return Math.hypot(pA.x - pB.x, pA.y - pB.y);
}

start();