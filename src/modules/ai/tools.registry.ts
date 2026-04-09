import { DirectoryTool } from '../tools/directory.tool';
import { FileTool } from '../tools/file.tool';
import { ShellTool } from '../tools/shell.tool';

export const tools = {
    directory: new DirectoryTool(),
    shell: new ShellTool(),
    file: new FileTool(),
};
