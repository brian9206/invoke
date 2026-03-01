'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── project_network_policies ──────────────────────────────────────────
    await queryInterface.createTable('project_network_policies', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      project_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'projects', key: 'id' }, onDelete: 'CASCADE',
      },
      action: { type: Sequelize.STRING(10), allowNull: false },
      target_type: { type: Sequelize.STRING(10), allowNull: false },
      target_value: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.STRING(255) },
      priority: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addConstraint('project_network_policies', {
      fields: ['action'], type: 'check', where: { action: ['allow', 'deny'] },
    });
    await queryInterface.addConstraint('project_network_policies', {
      fields: ['target_type'], type: 'check', where: { target_type: ['ip', 'cidr', 'domain'] },
    });
    await queryInterface.addIndex('project_network_policies', ['project_id'], {
      name: 'idx_project_network_policies_project_id',
    });
    await queryInterface.addIndex('project_network_policies', ['project_id', 'priority'], {
      name: 'idx_project_network_policies_priority',
    });

    // ── global_network_policies ───────────────────────────────────────────
    await queryInterface.createTable('global_network_policies', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      action: { type: Sequelize.STRING(10), allowNull: false },
      target_type: { type: Sequelize.STRING(10), allowNull: false },
      target_value: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.STRING(255) },
      priority: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addConstraint('global_network_policies', {
      fields: ['action'], type: 'check', where: { action: ['allow', 'deny'] },
    });
    await queryInterface.addConstraint('global_network_policies', {
      fields: ['target_type'], type: 'check', where: { target_type: ['ip', 'cidr', 'domain'] },
    });
    await queryInterface.addIndex('global_network_policies', ['priority'], {
      name: 'idx_global_network_policies_priority',
    });

    // Default global network policies (block private / loopback addresses)
    await queryInterface.sequelize.query(`
      INSERT INTO global_network_policies (action, target_type, target_value, description, priority) VALUES
        ('deny', 'cidr', '10.0.0.0/8',      'Block private network (RFC1918)',  1),
        ('deny', 'cidr', '172.16.0.0/12',   'Block private network (RFC1918)',  2),
        ('deny', 'cidr', '192.168.0.0/16',  'Block private network (RFC1918)',  3),
        ('deny', 'cidr', '127.0.0.0/8',     'Block loopback',                   4),
        ('deny', 'cidr', 'fc00::/7',        'Block IPv6 ULA (RFC4193)',          5),
        ('deny', 'cidr', 'fe80::/10',       'Block IPv6 link-local',             6),
        ('deny', 'cidr', '::1/128',         'Block IPv6 loopback',               7);
    `);

    // Copy default policies to all existing projects
    await queryInterface.sequelize.query(`
      INSERT INTO project_network_policies
        (project_id, action, target_type, target_value, description, priority)
      SELECT p.id, rule.action, rule.target_type, rule.target_value, rule.description, rule.priority
      FROM projects p
      CROSS JOIN global_network_policies rule;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('project_network_policies');
    await queryInterface.dropTable('global_network_policies');
  },
};
