import sql from '../../db/sql.js';
import HttpError from '../../lib/HttpError.js';
import toApproval from '../../agents/toApproval.js';

export default {
  name: 'get_approval',
  title: 'Check an approval',
  description: 'The status of an action the caller asked a person to approve: pending, approved (with the result), declined or failed.',
  write: false,
  http: { method: 'GET', path: '/approvals/{id}' },
  inputSchema: { type: 'object', properties: { id: { type: 'string', maxLength: 40 } }, required: ['id'], additionalProperties: false },
  run(args, { user }) {
    const approval = toApproval(sql.get('SELECT * FROM agent_approvals WHERE id = ? AND agent_id = ?', args.id, user.id));
    if (!approval) throw HttpError.notFound('That approval');
    const { id, status, tool, summary, reasons, taskKey, decidedAt, result, createdAt } = approval;
    return { id, status, tool, summary, reasons, task: taskKey, createdAt: new Date(createdAt).toISOString(), decidedAt: decidedAt ? new Date(decidedAt).toISOString() : null, result };
  },
};
