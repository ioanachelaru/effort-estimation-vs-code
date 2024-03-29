import * as vscode from "vscode";
import { getNonce } from "./getNonce";

export class ExtensionPannel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: ExtensionPannel | undefined;

  public static readonly viewType = "effort-estimation";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  public _prediction: string | undefined;

  public static createOrShow(extensionUri: vscode.Uri, prediction: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (ExtensionPannel.currentPanel) {
      ExtensionPannel.currentPanel._panel.reveal(column);
      ExtensionPannel.currentPanel._update(prediction);

      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      ExtensionPannel.viewType,
      "Effort estimation",
      column || vscode.ViewColumn.One,
      {
        // Enable javascript in the webview
        enableScripts: true,

        // And restrict the webview to only loading content from our extension's `media` directory.
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "media"),
          vscode.Uri.joinPath(extensionUri, "controller")
        ],
      }
    );

    ExtensionPannel.currentPanel = new ExtensionPannel(panel, extensionUri, prediction);
  }

  public static kill() {
    ExtensionPannel.currentPanel?.dispose();
    ExtensionPannel.currentPanel = undefined;
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, prediction: string) {
    ExtensionPannel.currentPanel = new ExtensionPannel(panel, extensionUri, prediction);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, prediction: string) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update(prediction);

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public dispose() {
    ExtensionPannel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private async _update(prediction: string) {
    this._prediction = prediction;
    const webview = this._panel.webview;

    this._panel.webview.html = this._getHtmlForWebview(webview);
    webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case "onInfo": {
          if (!data.text) {
            return;
          }
          vscode.window.showInformationMessage(data.text);
          break;
        }
        case "onError": {
          if (!data.text) {
            return;
          }
          vscode.window.showErrorMessage(data.text);
          break;
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // And the uri we use to load this script in the webview
    const controllerUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "controller", "controlsWebview.js")
    );

    // Local path to css styles
    const styleResetPath = vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "reset.css"
    );
    const stylesPathMainPath = vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "vscode.css"
    );

    // Uri to load styles into webview
    const stylesResetUri = webview.asWebviewUri(styleResetPath);
    const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
        -->
		    <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesResetUri}" rel="stylesheet">
        <link href="${stylesMainUri}" rel="stylesheet">
        </script>
      </head>
      <body>
        <div class="info-container">
          <h1>Effort estimation</h1>
          <h4 class="ext-info">Based on your input, this is the effort required to finish your project, happy coding :)</h4>
        </div>
        <div class="container">
          <h1 class="loader__title">0</h1>
          <h3 class="loader__metric">hours</h3>
        </div>
        <script>
          console.log("prediction is ", ${this._prediction})
          let title = /** @type {HTMLElement} */ (document.querySelector('.loader__title'));

          let currentNumber = title.innerText;

          setInterval(() => {
            if (currentNumber < ${this._prediction}) {
              currentNumber++;
              title.innerText = currentNumber;
            } else if (currentNumber > ${this._prediction}) {
              currentNumber--;
              title.innerText = currentNumber;
            }
          }, 1);

        </script>
      </body>
      </html>`;
  }
}