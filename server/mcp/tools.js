import whoami from './tools/whoami.js';
import workspaceSummary from './tools/workspaceSummary.js';
import myAssignments from './tools/myAssignments.js';
import myInbox from './tools/myInbox.js';
import markInboxRead from './tools/markInboxRead.js';
import listTasks from './tools/listTasks.js';
import searchTasks from './tools/searchTasks.js';
import getTask from './tools/getTask.js';
import listProjects from './tools/listProjects.js';
import listLabels from './tools/listLabels.js';
import listPeople from './tools/listPeople.js';
import listGoals from './tools/listGoals.js';
import createTaskTool from './tools/createTaskTool.js';
import updateTaskTool from './tools/updateTaskTool.js';
import claimTask from './tools/claimTask.js';
import addCommentTool from './tools/addCommentTool.js';
import watchTask from './tools/watchTask.js';
import deleteTask from './tools/deleteTask.js';
import startTimeEntry from './tools/startTimeEntry.js';
import stopTimeEntry from './tools/stopTimeEntry.js';
import getApproval from './tools/getApproval.js';

// Everything a connected assistant or agent can do, over MCP, the agent REST API and the
// built-in runner alike; the OpenAPI document is generated from this list too. Each tool runs
// as the caller and goes through the same services, visibility rules and validation as the app.
const tools = [
  whoami,
  workspaceSummary,
  myAssignments,
  myInbox,
  markInboxRead,
  listTasks,
  searchTasks,
  getTask,
  listProjects,
  listLabels,
  listPeople,
  listGoals,
  createTaskTool,
  updateTaskTool,
  claimTask,
  addCommentTool,
  watchTask,
  deleteTask,
  startTimeEntry,
  stopTimeEntry,
  getApproval,
];

export default tools;
