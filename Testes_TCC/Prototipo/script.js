const video = document.getElementById('videoEl');
const canvas = document.getElementById('overlay');
const piscas = document.getElementById('piscas');
const ctx = canvas.getContext('2d');

let totalBlinks = 0;
let earBelowThresholdFrames = 0;
let earAboveThresholdFrames = 0;

let blinkInProgress = false;
let debounceFrames = 0;

const EAR_THRESHOLD = 0.269; // Limiar de fechamento dos olhos
const EAR_CONSEC_FRAMES = 2; // Frames abaixo do limiar para confirmar fechamento
const EAR_REOPEN_FRAMES = 2; // Pode manter igual ao fechamento ou ajustar
const DEBOUNCE_AFTER_BLINK = 3; //Ajuste para piscadas curtas e para evitar piscadas duplas

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
    canvas.width = video.videoWidth;
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
    const leftEAR = getEAR(lm.getLeftEye());
    const rightEAR = getEAR(lm.getRightEye());
    const avgEAR = (leftEAR + rightEAR) / 2;

    // Processo debounce pós-piscada
    if (debounceFrames > 0) {
      debounceFrames--;
      requestAnimationFrame(onPlay);
      return;
    }

    if (avgEAR < EAR_THRESHOLD) {
      earBelowThresholdFrames++;
      earAboveThresholdFrames = 0;

      if (!blinkInProgress && earBelowThresholdFrames >= EAR_CONSEC_FRAMES) {
        blinkInProgress = true;
        console.log("🔒 olhos fechados");
      }
    } else {
      earAboveThresholdFrames++;
      earBelowThresholdFrames = 0;

      if (blinkInProgress && earAboveThresholdFrames >= EAR_REOPEN_FRAMES) {
        blinkInProgress = false;
        totalBlinks++;        
        piscas.innerText = `✅ Piscou! Total: ${totalBlinks}`;
        console.log("✅ Piscada detectada!");

        // Inicia debounce para evitar contagem dupla
        debounceFrames = DEBOUNCE_AFTER_BLINK;
      }
    }
  } else {
    // Sem rosto detectado → resetar estados
    earBelowThresholdFrames = 0;
    earAboveThresholdFrames = 0;
    blinkInProgress = false;
    debounceFrames = 0;
  }

  requestAnimationFrame(onPlay);
}

function getEAR(eye) {
  const [p1, p2, p3, p4, p5, p6] = eye;
  const a = distance(p2, p6);
  const b = distance(p3, p5);
  const c = distance(p1, p4);
  return (a + b) / (2 * c);
}

function distance(pA, pB) {
  return Math.hypot(pA.x - pB.x, pA.y - pB.y);
}

start();