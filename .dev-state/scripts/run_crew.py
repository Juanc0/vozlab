import os
from crewai import Agent, Task, Crew, LLM
from crewai.tools import tool
from crewai_tools import FileWriterTool, FileReadTool

# Inicializar herramientas
file_writer = FileWriterTool()
file_reader = FileReadTool()

@tool("Ejecutar Comando Shell")
def shell_command_tool(command: str) -> str:
    """Ejecuta estrictamente un comando de terminal (ej. pnpm install) y devuelve el resultado."""
    import subprocess
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True
        )
        return result.stdout or "Comando ejecutado exitosamente."
    except subprocess.CalledProcessError as e:
        return f"Error en comando: {e.stderr}"

local_llm = LLM(
    model="ollama/qwen2.5-coder:7b",
    base_url="http://localhost:11434"
)

# Definir el agente con instrucciones de comportamiento más directas
developer = Agent(
    role="Ingeniero DevOps Senior",
    goal="Crear físicamente los archivos de configuración del monorepo usando obligatoriamente las herramientas provistas.",
    backstory=(
        "Eres un agente de ejecución automatizada. NUNCA respondas con texto explicativo ni simules código en JSON. "
        "Utiliza siempre las herramientas asignadas para escribir los archivos en el disco y ejecutar los comandos."
    ),
    tools=[file_writer, file_reader, shell_command_tool],
    verbose=True,
    llm=local_llm,
    allow_delegation=False
)

hito_01_task = Task(
    description=(
        "Ejecuta las acciones mecánicas del HITO-0.1:\n"
        "1. Escribe el archivo 'pnpm-workspace.yaml' con el contenido: 'packages/*'\n"
        "2. Escribe el archivo 'package.json' con un objeto JSON básico de workspace privado.\n"
        "3. Escribe el archivo 'turbo.json' con la configuración básica.\n"
        "No des explicaciones teóricas; ejecuta las herramientas de escritura inmediatamente."
    ),
    expected_output="Confirmación de que los archivos han sido físicamente escritos en el disco.",
    agent=developer
)

vozlab_crew = Crew(
    agents=[developer],
    tasks=[hito_01_task],
    verbose=True
)

if __name__ == "__main__":
    print("🚀 Ejecutando tripulación con enfoque estricto de herramientas...")
    result = vozlab_crew.kickoff()
    print("\n✅ ¡Proceso finalizado!")
    print(result)