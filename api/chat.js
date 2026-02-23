// =============================================================
// BACKEND: api/chat.js
// Načítá sborníky jako Markdown textové soubory (ne PDF).
// Výrazně nižší token count, funguje na Tier 2 s cachingem.
// =============================================================

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Jsi odborný asistent konferencí Pitná voda pořádaných firmou ENVI-PUR, s.r.o.
Máš k dispozici sborníky ze dvou ročníků konference.
Odpovídáš výhradně na základě přiložených sborníků přednášek.

Pravidla:
1. Odpovídej POUZE na základě obsahu sborníků - nepřidávej vlastní znalosti ani informace z jiných zdrojů
2. Při každé odpovědi VŽDY jasně uveď z kterého ročníku (2022 nebo 2024) informace pochází
3. Pokud se stejné téma nebo autor vyskytuje v obou ročnících, uveď obě informace odděleně s označením roku
4. Pokud se téma v žádném sborníku nenachází, řekni: "Toto téma nebylo na konferencích Pitná voda 2022 ani 2024 probíráno. Více informací může přinést příští ročník konference."
5. Odpovídej věcně, odborně a stručně
6. Pokud se ptají na konkrétní příspěvek, vždy uveď autora, název příspěvku, rok konference a stručné shrnutí
7. Pokud se ptají na autora, uveď všechny jeho příspěvky ze všech ročníků s uvedením roku
8. Pokud se ptají na téma, vypiš všechny relevantní příspěvky z obou ročníků
9. Odpovídej vždy česky

Konference: Pitná voda (ročníky 2022 a 2024)
Pořadatel: ENVI-PUR, s.r.o.`;

// Načtení sborníků při startu serveru (jednou, ne při každém dotazu)
let text2022 = null;
let text2024 = null;

function loadTexts() {
  try {
    const p2022 = path.join(process.cwd(), "public", "sbornik_2022.md");
    text2022 = fs.readFileSync(p2022, "utf-8");
    console.log("Sborník 2022 načten, délka:", text2022.length);
  } catch (err) {
    console.error("Chyba při načítání sborníku 2022:", err.message);
  }
  try {
    const p2024 = path.join(process.cwd(), "public", "sbornik_2024.md");
    text2024 = fs.readFileSync(p2024, "utf-8");
    console.log("Sborník 2024 načten, délka:", text2024.length);
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
            // Sborník 2022 jako text s cachingem
            {
              type: "text",
              text: `<sbornik_2022>\n${text2022}\n</sbornik_2022>`,
              cache_control: { type: "ephemeral" },
            },
            // Sborník 2024 jako text s cachingem
            {
              type: "text",
              text: `<sbornik_2024>\n${text2024}\n</sbornik_2024>`,
              cache_control: { type: "ephemeral" },
            },
            // Dotaz uživatele
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
