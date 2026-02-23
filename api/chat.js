// =============================================================
// BACKEND: api/chat.js
// Toto je serverová část - běží na Vercel, nikdy není viditelná
// návštěvníkům. Chrání tvůj API klíč.
// =============================================================

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

// Inicializace Claude klienta
// API klíč se načte z prostředí Vercel (nastavíš ho v dashboardu)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Systémový prompt - definuje chování bota
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

export default async function handler(req, res) {
  // Povolení CORS - umožňuje volání z jiných domén (iframe)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Pouze POST metoda" });
  }

  const { message } = req.body;

  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "Zpráva nesmí být prázdná" });
  }

  // Načtení obou PDF sborníků
  // Soubory musí být uloženy jako:
  //   public/sbornik_2022.pdf
  //   public/sbornik_2024.pdf
  let pdf2022Base64, pdf2024Base64;

  try {
    const path2022 = path.join(process.cwd(), "public", "sbornik_2022.pdf");
    pdf2022Base64 = fs.readFileSync(path2022).toString("base64");
  } catch (err) {
    console.error("Chyba při načítání sborníku 2022:", err);
    return res.status(500).json({ error: "Sborník 2022 nebyl nalezen. Kontaktujte správce." });
  }

  try {
    const path2024 = path.join(process.cwd(), "public", "sbornik_2024.pdf");
    pdf2024Base64 = fs.readFileSync(path2024).toString("base64");
  } catch (err) {
    console.error("Chyba při načítání sborníku 2024:", err);
    return res.status(500).json({ error: "Sborník 2024 nebyl nalezen. Kontaktujte správce." });
  }

  try {
    // Volání Claude API s oběma sborníky jako kontextem
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            // Sborník 2022
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdf2022Base64,
              },
              title: "Sborník konference Pitná voda 2022",
            },
            // Sborník 2024
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdf2024Base64,
              },
              title: "Sborník konference Pitná voda 2024",
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
    return res
      .status(500)
      .json({ error: "Chyba při zpracování dotazu. Zkuste to znovu." });
  }
}
