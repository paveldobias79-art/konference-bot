// =============================================================
// BACKEND: api/chat.js
// =============================================================

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Jsi odborný asistent konferencí Pitná voda pořádaných firmou ENVI-PUR, s.r.o.
Máš k dispozici sborníky ze dvou ročníků konference (2022 a 2024).
Odpovídáš výhradně na základě přiložených sborníků.

STYL KOMUNIKACE:
- Odpovídej přirozeným, konverzačním jazykem – jako zkušený kolega, ne jako databáze
- Nikdy nevypisuj syrové seznamy všech příspěvků
- Shrň témata do tematických celků vlastními slovy
- Pokud je témat hodně, vyber 3–5 nejzajímavějších a zmiň, že dalších příspěvků bylo více
- Při odpovědích na konkrétní téma uveď 1–3 nejrelevantnější příspěvky s autorem a stručným popisem
- Odpovědi drž přiměřeně krátké – max 150–200 slov, pokud uživatel nežádá detail
- Pokud se uživatel chce dozvědět víc, nabídni že můžeš rozvést konkrétní téma

PRAVIDLA:
- Odpovídej POUZE na základě obsahu sborníků
- Vždy uveď ze kterého ročníku (2022 nebo 2024) informace pochází
- Pokud téma nebylo probíráno, řekni to přirozeně a nabídni příbuzné téma které probíráno bylo
- Odpovídej vždy česky

Konference: Pitná voda (ročníky 2022 a 2024)
Pořadatel: ENVI-PUR, s.r.o.`;

let text2022 = null;
let text2024 = null;

function loadTexts() {
  try {
    const p2022 = path.join(process.cwd(), "public", "sbornik_2022.md");
    text2022 = fs.readFileSync(p2022, "utf-8");
    console.log("Sborník 2022 načten.");
  } catch (err) {
    console.error("Chyba při načítání sborníku 2022:", err.message);
  }
  try {
    const p2024 = path.join(process.cwd(), "public", "sbornik_2024.md");
    text2024 = fs.readFileSync(p2024, "utf-8");
    console.log("Sborník 2024 načten.");
  } catch (err) {
    console.error("Chyba při načítání sborníku 2024:", err.message);
  }
}

loadTexts();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Pouze POST metoda" });

  const { message } = req.body;
  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "Zpráva nesmí být prázdná" });
  }

  if (!text2022 || !text2024) {
    loadTexts();
    if (!text2022 || !text2024) {
      return res.status(500).json({ error: "Sborníky nebyly nalezeny. Kontaktujte správce." });
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `<sbornik_2022>\n${text2022}\n</sbornik_2022>`,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: `<sbornik_2024>\n${text2024}\n</sbornik_2024>`,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: message,
            },
          ],
        },
      ],
    });

    const answer = response.content[0].text;
    return res.status(200).json({ answer });

  } catch (err) {
    console.error("Chyba Claude API:", err);
    if (err.status === 429) {
      return res.status(429).json({
        error: "Příliš mnoho dotazů najednou. Počkejte chvíli a zkuste to znovu."
      });
    }
    return res.status(500).json({ error: "Chyba při zpracování dotazu. Zkuste to znovu." });
  }
}
