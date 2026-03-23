const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class RefreshToken extends Model {}

  RefreshToken.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      token_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'RefreshToken',
      tableName: 'refresh_tokens',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  RefreshToken.associate = (models) => {
    RefreshToken.belongsTo(models.User, { foreignKey: 'user_id' });
  };

  return RefreshToken;
};
