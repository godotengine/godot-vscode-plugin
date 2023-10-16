
export class Command {
	public command: string = "";
	public param_count: number = -1;
	public parameters: any[] = [];
	public complete: boolean = false;
	public threadId: number = 0;
}
