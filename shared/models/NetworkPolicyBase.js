const { Model, DataTypes } = require('sequelize');

/**
 * Factory helper — not a Sequelize model itself.
 *
 * Creates a network-policy model class for the given table, adding any
 * extra fields on top of the shared base columns.
 *
 * Shared columns (both tables):
 *   id, action, target_type, target_value, description, priority, created_at
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {string} tableName  - 'project_network_policies' | 'global_network_policies'
 * @param {string} modelName  - Sequelize model name ('ProjectNetworkPolicy' | 'GlobalNetworkPolicy')
 * @param {object} extraFields - Additional DataTypes fields (e.g. { project_id: ... })
 * @returns {typeof Model}
 */
function defineNetworkPolicy(sequelize, tableName, modelName, extraFields = {}) {
  class NetworkPolicy extends Model {}

  NetworkPolicy.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // Spread extra fields first so FK columns appear before shared ones
      ...extraFields,
      action: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [['allow', 'deny']] },
      },
      target_type: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [['ip', 'cidr', 'domain']] },
      },
      target_value: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(255),
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      modelName,
      tableName,
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  return NetworkPolicy;
}

module.exports = { defineNetworkPolicy };
