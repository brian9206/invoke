const { defineNetworkPolicy } = require('./NetworkPolicyBase');

module.exports = (sequelize) => {
  // No extra fields — global policies are not scoped to a project.
  const GlobalNetworkPolicy = defineNetworkPolicy(
    sequelize,
    'global_network_policies',
    'GlobalNetworkPolicy'
  );

  // No associations — global policies are standalone rows.

  return GlobalNetworkPolicy;
};
