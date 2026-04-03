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
- si una comida no fue pedida, no la incluyas
- priorizar proteína
- respetar de forma aproximada las calorías restantes, pero sin intentar consumir todo el restante del día en una sola comida
- si se pide una sola comida, proponer una porción razonable para una sola comida, no para todo el día
- si se piden varias comidas, distribuir mejor calorías y proteína entre ellas
- si hay ingredientes disponibles, priorizarlos
- las cantidades deben ser claras y útiles para cocinar o cargar
- hablar en medidas cocidas cuando aplique
- también podés usar unidades prácticas cuando sea más útil, por ejemplo: 2 huevos, 1 cucharada, 1 cucharadita, 10 almendras
- no uses cantidades absurdas o exageradas para una sola comida
- usar nombres comunes y simples
- usar español de Argentina
- usar "palta", no "aguacate"
- usar "banana", no "plátano"
- usar "papa", no "patata"
- usar "carne" o "bife", no "bistec"
- evitar nombres rebuscados, gourmet o ambiguos
- puede quedar un poco por debajo de las calorías si sigue siendo razonable
- no hagas explicaciones ni recomendaciones fuera del JSON
- si hay dudas entre términos, elegir siempre la forma más común en Argentina

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
