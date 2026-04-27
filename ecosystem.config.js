module.exports = {
  apps: [
    { 
      name: "admin", 
      script: "npm",
      args: "run dev",
      cwd: "./invoke-admin",
    },
    { 
      name: "gateway", 
      script: "npm",
      args: "run dev",
      cwd: "./invoke-gateway",
    },
    { 
      name: "logger", 
      script: "npm",
      args: "run dev",
      cwd: "./invoke-logger",
    },
    { 
      name: "scheduler", 
      script: "npm",
      args: "run dev",
      cwd: "./invoke-scheduler",
    }
  ]
};
