'use strict';

// Types or folder names
const TYPE_JSON = "json-files";
const TYPE_JS = "js-files";

// Persistence
const STORAGE_KEY = "records";
const INITIAL = {
  [TYPE_JS]: {},
  [TYPE_JSON]: {}
};

/**
 * Core or JS implementation of reading files */
const read = (() => {
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
})();

/**
 * Core or JS implementation of save records */
const records = (() => {
  const state = {
    data: {},
    sub: [],
  };
  const _notify = () => {
    for (const notify of state.sub) {
      notify();
    }
  };
  const _update = (data) => {
    for (const type in data) {
      const ref = data[type];

      if (ref != null && typeof ref === "object") {
        const cur = state.data[type];

        state.data[type] = cur == null ? ref : { ...cur, ...ref };
      } else {
        state.data[type] = ref;
      }
    }

    return state.data;
  };
  const api = (type, id) => {
    if (!state.data) {
      return null;
    }

    if (!state.data[type]) {
      return null;
    }

    if (Boolean(type) && id == null) {
      return state.data[type];
    }

    if (!state.data[type][id]) {
      return null;
    }

    return state.data[type][id];
  };

  api.subscribe = (listener) => {
    let subscribed = true;

    state.sub.push(listener);

    return () => {
      if (subscribed) {
        subscribed = false;
        state.sub.splice(state.sub.indexOf(listener), 1);
      }
    };
  };

  api.update = (data) => {
    save(_update(data));
  };

  api.change = (data) => {
    api.update(data);

    _notify();
  };

  api.init = () => {
    state.data = load();

    _notify();
  };

  return api;

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);

    return raw ? parse(raw) : INITIAL;
  }

  function parse(data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      return INITIAL;
    }
  }
})();

/**
 * React implementation of save records and provide data to component */
const RecordsContext = React.createContext({});

function RecordsProvider(props) {
  React.useEffect(() => {
    records.init();
  }, []);

  return (
    <RecordsContext.Provider value={records}>
      {props.children}
    </RecordsContext.Provider>
  );
}

function useRecords() {
  const records = React.useContext(RecordsContext);
  const [, set] = React.useState(0);

  React.useEffect(() => records.subscribe(() => set((n) => n + 1)), []);

  return records;
}

function withRecords(C) {
  function Records(props) {
    const records = React.useContext(RecordsContext);
    const [_rev, set] = React.useState(0);

    React.useEffect(() => records.subscribe(() => set((n) => n + 1)), []);

    // Pass "_rev" prop for re-render the component
    // For ex. in case of using with redux "connect"
    // "Connect" wrap component into "React.memo",
    //  the component will not update if "records" data had been changed
    //  because "records" is the same object
    return React.createElement(C, { ...props, records, _rev });
  }

  Records.displayName = `withRecords(${C.displayName || C.name})`;

  Records.WrappedComponent = C;

  return Records;
}

ReactDOM
  .createRoot(document.querySelector('#output'))
  .render(
    <RecordsProvider>
      <Page />
    </RecordsProvider>
  );

const RecordItemWithHOC = withRecords(RecordItemWithHOCPure);

function Page() {
  return (
    <div>
      <Title />
      <ReadFiles />
      <Hr />
      <h2>Usage with hook</h2>
      <RecordItemWithHook type={TYPE_JS} id="function-1" />
      <Hr />
      <RecordItemWithHook type={TYPE_JSON} id="data-1" />
      <Hr />
      <h2>Usage with HOC</h2>
      <RecordItemWithHOC type={TYPE_JS} id="function-2" />
      <Hr />
      <RecordItemWithHOC type={TYPE_JSON} id="data-2" />
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

function ReadFiles() {
  // Usage with react state
  // const [state, setState] = React.useState({ [TYPE_JS]: {}, [TYPE_JSON]: {} });
  // const handleClick = async () => {
  //   const res = await read();
  //
  //   setState(() => res);
  // };

  // Usage with react context
  const records = useRecords();
  const handleClick = async () => {
    const res = await read();

    records.change(res);
  };

  return (
    <div>
      <h2>Press "Click" on button to open files</h2>
      <p>Select <mark>local-path-to-repository/react-file-system-access-api/resources</mark> and it will open content from <mark>src</mark> folder</p>
      <p><b>Note 1: </b><mark>resources</mark> and <mark>src</mark> is not required names, you can use names which is needed for solving your issues, just rewrite code according to your needs</p>
      <p><b>Note 2: </b>after reloading page in browser you need to open folder again to have access to resources</p>
      <button type="button" onClick={handleClick}>Click</button>
      <Hr />
      <div>
        <h3>
          JS files
        </h3>
        <pre>
          {/*{JSON.stringify(state[TYPE_JS], undefined, 2)}*/}
          {JSON.stringify(records(TYPE_JS), undefined, 2)}
        </pre>
      </div>
      <Hr />
      <div>
        <h3>
          JSON files
        </h3>
        <pre>
          {/*{JSON.stringify(state[TYPE_JSON], undefined, 2)}*/}
          {JSON.stringify(records(TYPE_JSON), undefined, 2)}
        </pre>
      </div>
    </div>
  );
}

function RecordItemWithHook(props) {
  const records = useRecords();

  return (
    <div>
      <h3>Folder {props.type}, file: {props.id}</h3>
      <pre>
        {JSON.stringify(records(props.type, props.id), undefined, 2)}
      </pre>
    </div>
  );
}

function RecordItemWithHOCPure(props) {
  return (
    <div>
      <h3>Folder {props.type}, file: {props.id}</h3>
      <pre>
        {JSON.stringify(props.records(props.type, props.id), undefined, 2)}
      </pre>
    </div>
  );
}

function Hr() {
  return <div style={{ backgroundColor: "gray", height: "1px", marginTop: "20px", marginBottom: "20px" }} />;
}
