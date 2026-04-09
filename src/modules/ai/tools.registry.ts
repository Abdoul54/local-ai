import { DirectoryTool } from '../tools/directory.tool';
import { FileTool } from '../tools/file.tool';
import { ShellTool } from '../tools/shell.tool';
import { SearchTool } from '../tools/search.tool';

export function createTools(availableTools: string[]) {
    return {
        directory: new DirectoryTool(),
        shell: new ShellTool(),
        file: new FileTool(),
        search: new SearchTool(availableTools),
    };
}
