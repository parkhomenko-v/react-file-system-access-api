'use strict';

/**
 * Core or JS implementation of reading files */
// Types or folder names
const TYPE_JSON = "json-files";
const TYPE_JS = "js-files";

function createApi() {
  const state = {
    resourcesHandle: null,
    lastRead: 0,
    lastModified: 0,
    isModified: false,
  };
  const _read = async () => {
    const records = {};

    if (state.resourcesHandle.name === "resources") {
      const srcHandle = await state.resourcesHandle.getDirectoryHandle("src");

      for await (const folderHandle of srcHandle.values()) {
        const { name: type } = folderHandle;

        records[type] = {};

        if (folderHandle.values == null) {
          continue;
        }

        for await (const fileHandle of folderHandle.values()) {
          if (fileHandle.getFile == null) {
            continue;
          }

          const file = await fileHandle.getFile();
          const fileName = file.name.replace(/\.js(on)?$/, "");
          const fileText = await file.text();

          state.lastModified = Math.max(state.lastModified, file.lastModified);

          switch (file.type) {
            case "application/json": {
              const parsed = parse(fileText);
              const name = resolve(type, fileName, parsed);

              records[type][name] =
                type === TYPE_JS
                  ? { function: parsed, id: name }
                  : parsed;
              break;
            }
            case "text/javascript": {
              const name = resolve(type, fileName, fileText);

              records[type][name] =
                type === TYPE_JS
                  ? { function: fileText, id: name }
                  : fileText;
              break;
            }
            default: {
              const name = resolve(type, fileName, fileText);

              records[type][name] = fileText;
            }
          }
        }
      }
    }

    state.isModified = state.lastRead !== state.lastModified;
    state.lastRead = state.lastModified;

    return records;
  };
  const attach = async () => {
    if (window.showDirectoryPicker) {
      state.resourcesHandle = await window.showDirectoryPicker();

      return await _read();
    }

    return null;
  };

  const _api = async () => {
    if (state.resourcesHandle) {
      return await _read();
    }

    return await attach();
  };

  _api.isActive = () => Boolean(state.resourcesHandle);

  _api.isModified = () => state.isModified;

  return _api;

  function parse(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }

  function resolve(type, fileName, fileText) {
    if (type === TYPE_JSON) {
      return fileName;
    }

    if (fileText != null && typeof fileText === "object") {
      return fileText.id || fileName;
    }

    return fileName;
  }
}

ReactDOM
  .createRoot(document.querySelector('#output'))
  .render(<Page />);

function Page() {
  return (
    <div>
      <Title />
      <ReadFiles />
    </div>
  );
}

function Title() {
  return (
    <div>
      <h1>File System Access API</h1>
      <p>
        Sometimes we need to work with local files, for example with JSON files
      </p>
      <p>
        This code snipped is allow user to select files from file system in browser and do something with it
      </p>
    </div>
  );
}

const read = createApi();

function ReadFiles() {
  const [state, setState] = React.useState({ [TYPE_JS]: {}, [TYPE_JSON]: {} });
  const handleClick = async () => {
    const res = await read();

    setState(() => res);
  };

  return (
    <div>
      <h2>Press "Click" on button to open files</h2>
      <p>Select <mark>local-path-to-repository/react-file-system-access-api/resources</mark> and it will open content from <mark>src</mark> folder</p>
      <p><b>Note 1: </b><mark>resources</mark> and <mark>src</mark> is not required names, you can use names which is needed for solving your issues, just rewrite code according to your needs</p>
      <p><b>Note 2: </b>after reloading page in browser you need to open folder again to have access to resources</p>
      <button type="button" onClick={handleClick}>Click</button>
      <div>
        <h3>
          JS files
        </h3>
        <pre>
          {JSON.stringify(state[TYPE_JS], undefined, 2)}
        </pre>
      </div>
      <div style={{ backgroundColor: "gray", height: "1px", marginTop: "20px", marginBottom: "20px" }} />
      <div>
        <h3>
          JSON files
        </h3>
        <pre>
          {JSON.stringify(state[TYPE_JSON], undefined, 2)}
        </pre>
      </div>
    </div>
  );
}
