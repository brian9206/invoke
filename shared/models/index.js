/**
 * Model registry for invoke-shared.
 *
 * Call initModels(sequelize) once per service process (or per Next.js
 * request in dev mode via the service's own database.js singleton) to
 * register all models on the Sequelize instance and wire up associations.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {object} Keyed model map
 */
function initModels(sequelize) {
  // ── Core domain ──────────────────────────────────────────────────────────
  const User                       = require('./User')(sequelize);
  const Project                    = require('./Project')(sequelize);
  const ProjectMembership          = require('./ProjectMembership')(sequelize);
  const FunctionModel              = require('./Function')(sequelize);
  const FunctionVersion            = require('./FunctionVersion')(sequelize);
  const ApiKey                     = require('./ApiKey')(sequelize);
  const ExecutionLog               = require('./ExecutionLog')(sequelize);
  const FunctionEnvironmentVariable = require('./FunctionEnvironmentVariable')(sequelize);
  const GlobalSetting              = require('./GlobalSetting')(sequelize);

  // ── Network policies (NetworkPolicyBase is a factory helper, not a model) ─
  const ProjectNetworkPolicy = require('./ProjectNetworkPolicy')(sequelize);
  const GlobalNetworkPolicy  = require('./GlobalNetworkPolicy')(sequelize);

  // ── API Gateway ───────────────────────────────────────────────────────────
  const ApiGatewayConfig          = require('./ApiGatewayConfig')(sequelize);
  const ApiGatewayRoute           = require('./ApiGatewayRoute')(sequelize);
  const ApiGatewayRouteSettings   = require('./ApiGatewayRouteSettings')(sequelize);
  const ApiGatewayAuthMethod      = require('./ApiGatewayAuthMethod')(sequelize);
  const ApiGatewayRouteAuthMethod = require('./ApiGatewayRouteAuthMethod')(sequelize);

  const models = {
    User,
    Project,
    ProjectMembership,
    // Exposed as 'Function' so callers write models.Function
    Function: FunctionModel,
    FunctionVersion,
    ApiKey,
    ExecutionLog,
    FunctionEnvironmentVariable,
    GlobalSetting,
    ProjectNetworkPolicy,
    GlobalNetworkPolicy,
    ApiGatewayConfig,
    ApiGatewayRoute,
    ApiGatewayRouteSettings,
    ApiGatewayAuthMethod,
    ApiGatewayRouteAuthMethod,
  };

  // Wire up associations once all models exist
  Object.values(models).forEach((model) => {
    if (typeof model.associate === 'function') {
      model.associate(models);
    }
  });

  return models;
}

module.exports = { initModels };
