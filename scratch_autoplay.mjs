import axios from 'axios';

async function main() {
  const res = await axios.get('https://js.fprxnet.ws/npm/player-venom@0.3.6/dist/player.js');
  const code = res.data;

  let idx = 0;
  while ((idx = code.indexOf('"click"', idx)) !== -1) {
    console.log(code.substring(Math.max(0, idx - 40), Math.min(code.length, idx + 80)));
    idx += 7;
  }
}

main().catch(console.error);
