'use strict';

module.exports = {
  async up({ context: { queryInterface } }) {
    // Remove any IPv6 rules (target_value containing ':') from global_network_policies
    await queryInterface.sequelize.query(
      `DELETE FROM global_network_policies WHERE target_value LIKE '%:%'`
    );

    // Drop the NOTIFY trigger on project_network_policies if it exists
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS notify_project_network_policy_change ON project_network_policies;
    `);

    // Drop the trigger function if it exists
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS notify_project_network_policy_change();
    `);

    await queryInterface.dropTable('project_network_policies');
  },

  async down({ context: { queryInterface } }) {
    const Sequelize = queryInterface.sequelize.constructor;

    await queryInterface.createTable('project_network_policies', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      action: { type: Sequelize.STRING(10), allowNull: false },
      target_type: { type: Sequelize.STRING(10), allowNull: false },
      target_value: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.STRING(255) },
      priority: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addConstraint('project_network_policies', {
      fields: ['action'],
      type: 'check',
      where: { action: ['allow', 'deny'] },
      name: 'chk_project_network_policies_action',
    });

    await queryInterface.addConstraint('project_network_policies', {
      fields: ['target_type'],
      type: 'check',
      where: { target_type: ['ip', 'cidr', 'domain'] },
      name: 'chk_project_network_policies_target_type',
    });

    // Recreate the NOTIFY trigger for cache invalidation
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION notify_project_network_policy_change()
      RETURNS trigger AS $$
      BEGIN
        PERFORM pg_notify(
          'execution_cache_invalidate',
          json_build_object(
            'table', 'project_network_policies',
            'project_id', COALESCE(NEW.project_id, OLD.project_id)
          )::text
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER notify_project_network_policy_change
        AFTER INSERT OR UPDATE OR DELETE ON project_network_policies
        FOR EACH ROW EXECUTE FUNCTION notify_project_network_policy_change();
    `);
  },
};
