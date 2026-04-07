require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(express.json());
app.use(cors());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const INITIAL_SETUP_PROMPT = `
Solo JSON válido. Sin texto extra, sin markdown.
Formato: {"pesoObjetivoKg":number,"caloriasDiarias":number,"proteinasDiarias":number}
Dados los datos físicos del usuario, devolvé enteros razonables para descenso de peso sostenible.
PESO OBJETIVO:
- Calculá el rango IMC saludable (22–25) para la altura dada
- Tomá el punto medio de ese rango como base
- Ajustá hacia arriba si: contextura grande, huesos grandes, más de 45 años, mucho músculo
- Ajustá hacia abajo si: contextura pequeña, sedentarismo extremo
- El resultado debe ser un único número entero, razonable y alcanzable, no el mínimo ni el máximo
- Nunca devuelvas el peso actual como objetivo si hay que bajar

CALORÍAS DIARIAS (para descenso sostenible):
- Calculá el TDEE según la fórmula Mifflin-St Jeor con el peso objetivo como meta
- Multiplicá por el factor de actividad:
  sedentario      × 1.2
  1–2 veces/semana × 1.375
  3–4 veces/semana × 1.55
  5+ veces/semana  × 1.725
- Al resultado restale entre 400 y 600 kcal para generar déficit moderado
- Mínimo absoluto: 1200 kcal mujeres / 1400 kcal hombres

PROTEÍNA DIARIA:
- Entre 1.6g y 2g por kg de peso objetivo
- Subí al límite superior si hace actividad física frecuente
- Devolvé enteros en todos los campos
`.trim();

const PLAN_MEALS_PROMPT = `
Sugerí comidas para una persona en dieta. Solo JSON válido, sin texto extra, sin markdown.

Formato exacto:
{"options":[{"label":"string","meals":{"desayuno":[{"nombre":"string","ingredientes":[{"nombre":"string","cantidad":"string"}],"calorias":number,"proteina":number}],"almuerzo":[],"merienda":[],"cena":[]}}]}

Reglas:
- Máximo 2 opciones
- Límites estrictos por comida (nunca superarlos):
  desayuno 150-300 kcal | merienda 100-250 kcal | almuerzo 400-600 kcal | cena 350-550 kcal
- La suma de todas las comidas no debe superar las calorías diarias informadas
- Proteína máxima por comida: 30g. Porciones realistas: 1 huevo, 1 lata de atún, máx 150g proteína
- Carnes, pollo y pescado: indicar siempre en gramos cocidos (no crudo)
- Heladera: usá solo ingredientes que tengan sentido para esa comida, no todo lo disponible
- Cantidades concretas, español argentino (palta, papa, bife, choclo)
- Sin texto fuera del JSON
`.trim();

function parseJson(text) {
  const cleaned = (text || "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSON no encontrado en la respuesta");
    return JSON.parse(match[0]);
  }
}

app.post("/chat", async (req, res) => {
  const { flowType, userData } = req.body;

  if (!flowType || !userData)
    return res.status(400).json({ error: "Faltan flowType o userData" });

  const prompts = {
    initial_setup: INITIAL_SETUP_PROMPT,
    plan_meals: PLAN_MEALS_PROMPT,
  };

  const systemInstruction = prompts[flowType];
  if (!systemInstruction)
    return res.status(400).json({ error: "flowType no válido" });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: JSON.stringify(userData),
      config: { systemInstruction, temperature: 0.4 },
    });

    return res.json(parseJson(response.text));
  } catch (err) {
    console.error("Error en /chat:", err);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

app.listen(process.env.PORT || 3001, "0.0.0.0", () =>
  console.log(`Servidor en http://localhost:${process.env.PORT || 3001}`)
);
