import subprocess
import time
import os
import sys
import psutil
import webbrowser

PROJETO = "Assistente Telecom"

def run_launcher():
    try:
        # 1. Inicia o servidor Node.js
        print(f"[1/3] Iniciando servidor Node.js...")
        # shell=True é usado para garantir que o npm (comando do sistema) seja encontrado
        node_process = subprocess.Popen(["npm", "start"], shell=True)

        # 2. Pausa para o servidor carregar
        time.sleep(3)

        # 3. Abre o arquivo no navegador padrão
        print(f"[2/3] Abrindo {PROJETO}...")
        path_to_html = os.path.abspath("public/index.html")
        webbrowser.open(f"file://{path_to_html}")

        print("\n=== MONITORAMENTO ATIVO ===")
        print(f"O servidor será encerrado ao fechar o navegador ou finalizar este launcher.")
        print("===========================\n")

        # 4. Monitoramento
        # Nota: O Python monitora o processo 'node_process' que ele mesmo criou
        while True:
            # Verifica se o processo principal do Node ainda está rodando
            if node_process.poll() is not None:
                break
            
            # Opcional: Se quiser fechar quando o processo do Python for encerrado, 
            # o loop mantém o script vivo.
            time.sleep(2)

    except KeyboardInterrupt:
        print("\nEncerrando por solicitação do usuário...")
    finally:
        # 5. Finalização limpa
        print("[3/3] Finalizando processos...")
        parent = psutil.Process(node_process.pid)
        for child in parent.children(recursive=True):
            child.kill()
        parent.kill()
        print("Tudo limpo. Saindo...")
        time.sleep(2)

if __name__ == "__main__":
    run_launcher()