// ecosystem.config.js
// Configuração do PM2 para o Swap Monitor em produção (VPS Linux)
// Singleton / Fork mode — Não utilizar cluster

module.exports = {
  apps: [
    {
      name: 'swap-monitor',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork', // Obrigatório: processo único (singleton)
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      kill_timeout: 8000, // Aguarda encerramento gracioso antes de SIGKILL
      env: {
        NODE_ENV: 'production',
        // PORT é obtida do arquivo .env ou ambiente do sistema
      },
      // Logs gerenciados pelo PM2
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
