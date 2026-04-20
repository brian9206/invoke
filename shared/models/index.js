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
  const FunctionGroup              = require('./FunctionGroup')(sequelize);
  const FunctionModel              = require('./Function')(sequelize);
  const FunctionVersion            = require('./FunctionVersion')(sequelize);
  const ApiKey                     = require('./ApiKey')(sequelize);
  const FunctionEnvironmentVariable = require('./FunctionEnvironmentVariable')(sequelize);
  const GlobalSetting              = require('./GlobalSetting')(sequelize);

  // ── Network policies ─────────────────────────────────────────────────────
  const NetworkPolicy = require('./NetworkPolicy')(sequelize);

  // ── API Gateway ───────────────────────────────────────────────────────────
  const ApiGatewayConfig          = require('./ApiGatewayConfig')(sequelize);
  const ApiGatewayRoute           = require('./ApiGatewayRoute')(sequelize);
  const ApiGatewayRouteSettings   = require('./ApiGatewayRouteSettings')(sequelize);
  const ApiGatewayAuthMethod      = require('./ApiGatewayAuthMethod')(sequelize);
  const ApiGatewayRouteAuthMethod = require('./ApiGatewayRouteAuthMethod')(sequelize);
  const LoginAttempt               = require('./LoginAttempt')(sequelize);
  const RefreshToken               = require('./RefreshToken')(sequelize);

  // ── Realtime ──────────────────────────────────────────────────────────────
  const RealtimeNamespace           = require('./RealtimeNamespace')(sequelize);
  const RealtimeEventHandler        = require('./RealtimeEventHandler')(sequelize);
  const RealtimeNamespaceAuthMethod = require('./RealtimeNamespaceAuthMethod')(sequelize);

  const models = {
    User,
    Project,
    ProjectMembership,
    FunctionGroup,
    // Exposed as 'Function' so callers write models.Function
    Function: FunctionModel,
    FunctionVersion,
    ApiKey,
    FunctionEnvironmentVariable,
    GlobalSetting,
    NetworkPolicy,
    ApiGatewayConfig,
    ApiGatewayRoute,
    ApiGatewayRouteSettings,
    ApiGatewayAuthMethod,
    ApiGatewayRouteAuthMethod,
    LoginAttempt,
    RefreshToken,
    RealtimeNamespace,
    RealtimeEventHandler,
    RealtimeNamespaceAuthMethod,
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
