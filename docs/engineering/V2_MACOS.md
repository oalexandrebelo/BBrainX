# BBrainX 2.0 — plano de otimização macOS (em desenvolvimento)

Base: `e3977cc45d05c564c469ebda83ebaca2bdab871a`, árvore da 1.5.0 publicada. Este arquivo inicia uma revisão de engenharia; não aumenta a versão do produto nem anuncia uma 2.0 homologada.

Prioridades: disponibilidade verificável do painel, fallback de leitura independente do servidor, contexto mínimo preservando obrigações, observabilidade de tokens/custo com proveniência e controle cooperativo entre harnesses. Mac mini e MacBook Pro Apple Silicon são o foco; não inferir RAM, versão do chip ou resultado de teste nativo pelo nome da máquina. A manutenção de outras plataformas permanece separada de um selo macOS.

A captura ERR_CONNECTION_REFUSED demonstra recusa da conexão local naquele instante. A documentação MAC_MINI.md registra que não existe daemon instalado e que o painel requer serve. Isso sustenta investigar startup/lifecycle antes de reescrever o frontend; não demonstra a causa exata na máquina do usuário, que está offline no Desktop Commander.

Referências fixadas: Orca `57452c681f27c03fd3c016a06da6315777db775a`; Agent Trail `6e53f21f292955974ac21a082edb4ac216e2ad92`. Estudar mecanismos, não incorporar Electron, novos modelos ou outro armazenamento canônico obrigatoriamente. Nenhum transcript privado ou credencial será coletado pela pesquisa.

O workflow desta branch registra testes e build na revisão efetiva. Suas cópias textuais upstream são inputs de inspeção, não dependências nem confirmação de funcionamento dos projetos de terceiros. A matriz macOS/Linux não representa Macs físicos do usuário ou avaliação de ganho em tarefa. Windows continua com o resultado do workflow geral, sem ocultar suas falhas.
