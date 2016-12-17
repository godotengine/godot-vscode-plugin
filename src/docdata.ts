"use strict";
import * as fs from 'fs';
import requestGodot from './request';
import * as vscode from 'vscode';
import * as path from 'path';

let version: string;
let storageDir: string;
let docdata: Object = null;

class DocDataManager {

  constructor(dir: string) {
    version = "";
    storageDir = dir;
    console.log(dir);
    // Load documents
    DocDataManager.getDocData().then(doc=>{
      docdata = doc;
      console.log("Godot Documentations loaded.");
      // vscode.window.showInformationMessage("Godot Documentations loaded.");
    }).catch(e=>{
      console.log(e);
    });
  }

  private static checkversion():Promise<string> {
    return new Promise((resolve, reject) => {
      if (version != "")
        resolve(version)
      else {
        requestGodot({action: "editor", command: "version"}).then((res:any)=>{
          version = res.version;
          resolve(version);
        }).catch(e=>{
          reject(e);
        });
      }
    });
  }

  public static getDocData() {
    return new Promise((resolve, reject) => {
      if(docdata)
        resolve(docdata);
      else {
          DocDataManager.checkversion().then((version: string)=> {
            try {
              const dir = path.join(storageDir, "docs");
              if(!(fs.existsSync(dir)))
                fs.mkdirSync(dir)
              // Load docdata from file
              const loadDocdata = (docfile) => {
                const content = fs.readFileSync(docfile, "utf-8");
                if(content && content.length > 0) {
                  docdata = JSON.parse(content);
                  resolve(docdata);
                }
                else
                  reject(new Error("Load Docdata failed!"));
              };
              const docfile: string = path.join(dir, version+".json")
              if(fs.existsSync(docfile) && fs.statSync(docfile).isFile())
                loadDocdata(docfile);
              else {
                requestGodot({action: "editor", command: "gendoc", path: docfile}).then((res:any)=>{
                  if(res && res.done)
                    loadDocdata(docfile);
                  else
                    reject(new Error("Generate Docdata failed!"));
                }).catch(e=>{
                  reject(new Error("Generate Docdata failed!"));
                });
              }
            } catch (error) {
              reject(new Error("Generate Docdata failed!"));
            }
          }).catch(e=> {
            reject(new Error("Get Docdata failed: cannot get version of your godot editor!"));
        }); 
      }
    });
  }
}

export default DocDataManager;