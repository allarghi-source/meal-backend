require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3001;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const initialSetupPrompt = `
Sos un asistente que analiza datos físicos generales para estimar objetivos iniciales de forma práctica.

Tu tarea es devolver únicamente un JSON válido.
No saludes.
No expliques.
No uses markdown.
No agregues texto fuera del JSON.

Formato obligatorio:
{
  "pesoObjetivoKg": number,
  "caloriasDiarias": number,
  "proteinasDiarias": number
}

Reglas:
- devolver números enteros
- el peso objetivo debe ser razonable y alcanzable
- las calorías deben apuntar a descenso de peso sostenible si corresponde
- la proteína debe ser suficiente para preservar masa muscular
- no hagas diagnósticos médicos
- si hay condiciones médicas, solo usalas como contexto prudente
`;

const planMealsPrompt = `
Sos un asistente que sugiere opciones de comida de forma simple y estructurada.

Tu tarea es devolver únicamente un JSON válido.
No saludes.
No expliques.
No uses markdown.
No agregues texto fuera del JSON.

Formato obligatorio:
{
  "options": [
    {
      "label": "Opción 1",
      "meals": {
        "desayuno": [
          {
            "nombre": "string",
            "ingredientes": [
              { "nombre": "string", "cantidad": "string" }
            ],
            "calorias": number,
            "proteina": number
          }
        ],
        "almuerzo": [],
        "merienda": [],
        "cena": []
      }
    }
  ]
}
Reglas:
- devolver máximo 2 opciones
- usar solo las comidas pedidas
- no incluir comidas no pedidas
- priorizar proteína
- respetar de forma aproximada las calorías restantes sin intentar consumir todo el restante en una sola comida
- desayuno y merienda deben ser livianos (≈200–350 kcal salvo que el restante sea muy bajo)
- almuerzo y cena pueden ser más completos, pero sin exceder el restante
- evitar cantidades exageradas o poco realistas (ej: más de 3 huevos en una comida)
- si el restante es bajo, proponer comidas más chicas en lugar de forzar proteína
- si se pide una sola comida, proponer una porción razonable para una sola comida
- si se piden varias comidas, distribuir mejor calorías y proteína entre ellas
- priorizar ingredientes disponibles si fueron informados
- cada comida debe ser ejecutable y no una idea general
- cada comida debe incluir siempre ingredientes con cantidad exacta y útil para cocinar, servir y cargar en la app
- usar como referencia principal cantidades cocidas cuando aplique
- también podés usar unidades prácticas cuando sea más útil, por ejemplo: 2 huevos, 1 cucharada, 1 cucharadita, 10 almendras
- si hay ensalada con aceite, incluir también la cantidad de aceite
- las calorías y proteínas deben corresponder al plato completo, no por ingrediente
- no usar cantidades absurdas o exageradas
- evitar descripciones ambiguas como "ensalada fresca" sin detalle
- usar nombres comunes y simples, en español de Argentina
- usar "palta", no "aguacate"
- usar "banana", no "plátano"
- usar "papa", no "patata"
- usar "carne" o "bife", no "bistec"
- evitar nombres rebuscados, gourmet o ambiguos
- si hay dudas entre términos, elegir siempre la forma más común en Argentina
- no hagas explicaciones ni recomendaciones fuera del JSON

`;

function parseJsonResponse(text) {
  const cleaned = (text || "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No se encontró un JSON válido en la respuesta");
    }
    return JSON.parse(match[0]);
  }
}

app.post("/chat", async (req, res) => {
  try {
    const { flowType, userData } = req.body;

    if (!flowType || !userData) {
      return res.status(400).json({
        error: "Faltan flowType o userData",
      });
    }

    let systemInstruction = "";
    let contents = "";

    if (flowType === "initial_setup") {
      systemInstruction = initialSetupPrompt;

      contents = `
DATOS DE LA PERSONA:
${JSON.stringify(userData, null, 2)}
`;
    } else if (flowType === "plan_meals") {
      systemInstruction = planMealsPrompt;

      contents = `
DATOS PARA PLANIFICAR:
${JSON.stringify(userData, null, 2)}
`;
    } else {
      return res.status(400).json({
        error: "flowType no válido",
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.4,
      },
    });

    const text = response.text || "";
    const parsed = parseJsonResponse(text);

    return res.json(parsed);
  } catch (error) {
    console.error("Error en /chat:", error);
    return res.status(500).json({
      error: "Error en el servidor",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
