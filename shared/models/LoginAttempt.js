const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class LoginAttempt extends Model {}

  LoginAttempt.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // Composite key: "<normalised-ip>:<username-lowercase>"
      key: {
        type: DataTypes.STRING(110),
        allowNull: false,
        unique: true,
      },
      attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      last_attempt_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      locked_until: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'LoginAttempt',
      tableName: 'login_attempts',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  // No associations — this is an independent rate-limiting table.

  return LoginAttempt;
};
