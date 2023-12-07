import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

import { format_document } from "./textmate";

import * as chai from "chai";
const expect = chai.expect;

const dots = ["..", "..", ".."];
const basePath = path.join(__filename, ...dots);

suite("GDScript Formatter Tests", () => {
  const snapshotsFolderPath = path.join(basePath, "src/formatter/snapshots");
  const testFolders = fs.readdirSync(snapshotsFolderPath);

  testFolders.forEach((testFolder) => {
    const testFolderPath = path.join(snapshotsFolderPath, testFolder);
    if (fs.statSync(testFolderPath).isDirectory()) {
      test(`Snapshot Test: ${testFolder}`, async () => {
        const uriIn = vscode.Uri.file(path.join(testFolderPath, "in.gd"));
        const uriOut = vscode.Uri.file(path.join(testFolderPath, "out.gd"));
        const documentIn = await vscode.workspace.openTextDocument(uriIn);
        const documentOut = await vscode.workspace.openTextDocument(uriOut);
        const edits = format_document(documentIn);

        // Apply the formatting edits
        const edit = new vscode.WorkspaceEdit();
        edit.set(uriIn, edits);
        await vscode.workspace.applyEdit(edit);

        // Compare the result with the expected output
        expect(documentIn.getText()).to.equal(documentOut.getText());
      });
    }
  });
});
