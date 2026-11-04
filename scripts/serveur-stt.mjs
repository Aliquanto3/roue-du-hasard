// Lance le serveur de transcription locale (whisper.cpp `whisper-server`) sur http://127.0.0.1:5201.
// Outil hors dépôt : aucune dépendance d'exécution dans roue.html ni roue-chat.html. Sans dépendance npm.
// Chemins par défaut sous ~/tools ; surcharge par WHISPER_SERVER (exécutable) et WHISPER_MODEL (modèle ggml).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = '5201';
const EXE = process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server';
const serveur = process.env.WHISPER_SERVER ?? join(homedir(), 'tools', 'whisper-cpp', 'Release', EXE);
const modele = process.env.WHISPER_MODEL ?? join(homedir(), 'tools', 'whisper-modeles', 'ggml-large-v3-turbo-q5_0.bin');

for (const [nom, chemin] of [['WHISPER_SERVER', serveur], ['WHISPER_MODEL', modele]]) {
  if (!existsSync(chemin)) {
    console.error(`${nom} introuvable : ${chemin}\nVoir docs/specs/6.1-essai-stt.md (section Installation).`);
    process.exit(1);
  }
}

// 127.0.0.1 seulement. Langue figée sur le français ; l'invite (prénoms) est envoyée par requête (champ `prompt`).
const fils = spawn(serveur, ['-m', modele, '--host', '127.0.0.1', '--port', PORT, '-l', 'fr', '-t', '4'], {
  stdio: 'inherit',
});
fils.on('error', (e) => {
  console.error(`Lancement impossible : ${e.message}`);
  process.exit(1);
});
fils.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => fils.kill());
