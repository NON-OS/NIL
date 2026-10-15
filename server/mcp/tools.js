import whoami from './tools/whoami.js';
import listTasks from './tools/listTasks.js';
import getTask from './tools/getTask.js';
import createTaskTool from './tools/createTaskTool.js';
import updateTaskTool from './tools/updateTaskTool.js';
import addCommentTool from './tools/addCommentTool.js';
import listProjects from './tools/listProjects.js';
import workspaceSummary from './tools/workspaceSummary.js';

// Everything a connected assistant can do. Each tool runs as the key's owner and goes through
// the same services, visibility rules and validation as the app itself.
const tools = [whoami, workspaceSummary, listTasks, getTask, listProjects, createTaskTool, updateTaskTool, addCommentTool];

export default tools;
