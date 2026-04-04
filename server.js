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
- máximo 2 opciones
- usar solo las comidas pedidas
- priorizar proteína sin exceder calorías restantes
- desayuno y merienda: livianos (≈200–350 kcal)
- almuerzo y cena: más completos, sin pasarse del restante
- si el restante es bajo, reducir tamaño en lugar de forzar proteína
- usar ingredientes disponibles si se informan

- cada comida debe ser concreta y ejecutable
- incluir ingredientes con cantidades claras y útiles (preferir cocido o unidades prácticas)
- incluir aceite si corresponde

- calorías y proteína corresponden al plato completo
- evitar cantidades poco realistas (ej: >3 huevos en una comida)
- evitar descripciones vagas

- usar nombres simples en español de Argentina (palta, banana, papa, carne/bife)
- no agregar texto fuera del JSON

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
