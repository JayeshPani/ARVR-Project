# Theme
System sans-serif; max-width 960px; 1rem app padding; native controls; light/dark system colours. Preserve existing visual language for functional controls.

```
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
}

#app {
  max-width: 960px;
  margin: 0 auto;
  padding: 1rem;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

nav button[aria-current="page"] {
  font-weight: bold;
  text-decoration: underline;
}

fieldset {
  border: 1px solid currentColor;
  border-radius: 4px;
}

#mri-previews {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

#mri-previews img {
  max-width: 200px;
  height: auto;
}

```
