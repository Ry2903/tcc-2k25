const video = document.getElementById('videoEl');
const canvas = document.getElementById('overlay');
const confirmation = document.getElementById('confirmation');
const piscas = document.getElementById('piscas');
const ctx = canvas.getContext('2d');

let blinkCounter = 0;
let eyesClosed = false;
const EAR_THRESHOLD = 0.25;      // ajuste após debugar
const EAR_CONSEC_FRAMES = 3;     // quantos frames abaixo do limiar conta como fechar

async function start() {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('./models')
  ]);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    video.srcObject = stream;
  } catch (err) {
    console.error("Erro ao acessar câmera:", err);
    return;
  }

  video.addEventListener('playing', () => {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    onPlay();
  });
}

async function onPlay() {
  if (video.paused || video.ended) return;

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (detection) {
    const resized = faceapi.resizeResults(detection, {
      width: canvas.width,
      height: canvas.height
    });
    faceapi.draw.drawDetections(canvas, resized);
    faceapi.draw.drawFaceLandmarks(canvas, resized);

    const lm = detection.landmarks;
    const leftEAR  = getEAR(lm.getLeftEye());
    const rightEAR = getEAR(lm.getRightEye());
    const avgEAR   = (leftEAR + rightEAR) / 2;

    // DEBUG
    //console.log("EAR =", avgEAR.toFixed(3));
    confirmation.innerText = `EAR: ${avgEAR.toFixed(3)}`;

    if (!eyesClosed && avgEAR < EAR_THRESHOLD) {
      blinkCounter++;
      if (blinkCounter >= EAR_CONSEC_FRAMES) {
        eyesClosed = true;
        console.log("👁️‍🗨️ olhos fechados");
      }
    }

    if (eyesClosed && avgEAR >= EAR_THRESHOLD) {
      console.log("👁️ olhos abertos → Piscada!");
      confirmation.innerText = '<p>✅ Piscou!</p>';
      piscas.innerText = '<p>✅ Piscou!</p>';
      setTimeout(() => confirmation.innerText = '', 800);
      eyesClosed = false;
      blinkCounter = 0;
    }
  } else {
    blinkCounter = 0;
    eyesClosed = false;
  }

  requestAnimationFrame(onPlay);
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