import os
from crewai import Agent, Task, Crew, LLM

# Configurar el LLM local con Ollama (compatible con OpenAI API)
local_llm = LLM(
    model="ollama/qwen2.5-coder:7b",
    base_url="http://localhost:11434"
)

# 1. Definir los Agentes
architect = Agent(
    role="Arquitecto de Software Principal",
    goal="Diseñar la estructura limpia del monorepo para VozLab usando pnpm workspaces y Turborepo.",
    backstory=(
        "Eres un experto en arquitecturas de monorepos modernos con TypeScript, Node.js, "
        "pnpm y Turborepo. Validas que los archivos de configuración cumplan con estándares estrictos."
    ),
    verbose=True,
    llm=local_llm,
    allow_delegation=False
)

developer = Agent(
    role="Ingeniero Full-Stack Senior",
    goal="Escribir físicamente en el disco los archivos de configuración del HITO-0.1 con precisión sintáctica absoluta.",
    backstory=(
        "Eres un programador metódico experto en herramientas de empaquetado y configuración de monorepos. "
        "Escribes archivos limpios, sin explicaciones innecesarias, directamente listos para producción."
    ),
    verbose=True,
    llm=local_llm,
    allow_delegation=False
)

# 2. Definir la Tarea basada en el HITO-0.1
hito_01_task = Task(
    description=(
        "Ejecuta el HITO-0.1 del Plan Maestro de VozLab. (/home/juan/repos/vozlab/.dev-state/EXECUTION_PLAN.md)\n"
        "Crea físicamente en la raíz del proyecto los siguientes archivos con su contenido completo:\n"
        "1. pnpm-workspace.yaml (incluyendo apps/* y packages/*)\n"
        "2. turbo.json\n"
        "3. package.json raíz\n"
        "4. packages/ts-config/base.json y package.json\n\n"
        "Asegúrate de que los archivos queden creados físicamente en el disco en sus rutas correctas."
    ),
    expected_output="Los archivos de configuración del HITO-0.1 creados físicamente en la estructura del monorepo.",
    agent=developer
)

# 3. Ensamblar la Tripulación (Crew)
vozlab_crew = Crew(
    agents=[architect, developer],
    tasks=[hito_01_task],
    verbose=True
)

if __name__ == "__main__":
    print("🚀 Iniciando tripulación CrewAI con Qwen2.5-Coder para HITO-0.1...")
    result = vozlab_crew.kickoff()
    print("\n✅ ¡Ejecución finalizada!")
    print(result)