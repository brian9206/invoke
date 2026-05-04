'use strict'

module.exports = {
  async up({ context: { queryInterface, Sequelize } }) {
    // ── login_attempts (rate-limiting) ─────────────────────────────────────
    await queryInterface.createTable('login_attempts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      key: {
        type: Sequelize.STRING(110),
        allowNull: false,
        unique: true
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      last_attempt_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      locked_until: {
        type: Sequelize.DATE,
        allowNull: true
      }
    })

    await queryInterface.sequelize.query('ALTER TABLE login_attempts SET UNLOGGED;')

    await queryInterface.addIndex('login_attempts', ['locked_until'], {
      name: 'login_attempts_locked_until_idx'
    })

    // ── refresh_tokens (auth token rotation) ───────────────────────────────
    await queryInterface.createTable('refresh_tokens', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    })

    await queryInterface.sequelize.query('ALTER TABLE refresh_tokens SET UNLOGGED;')

    await queryInterface.addIndex('refresh_tokens', ['token_hash'], {
      unique: true,
      name: 'refresh_tokens_token_hash_idx'
    })

    await queryInterface.addIndex('refresh_tokens', ['user_id'], {
      name: 'refresh_tokens_user_id_idx'
    })

    await queryInterface.addIndex('refresh_tokens', ['expires_at'], {
      name: 'refresh_tokens_expires_at_idx'
    })
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.dropTable('refresh_tokens')
    await queryInterface.dropTable('login_attempts')
  }
}
