const form = document.getElementById("form-excel");
const inputArchivo = document.getElementById("archivo");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!inputArchivo.files.length) {
    alert("Seleccioná un archivo");
    return;
  }

  const formData = new FormData();
  formData.append("archivo", inputArchivo.files[0]);

  try {
    const res = await fetch("/upload", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      throw new Error("Error al subir archivo");
    }

    const data = await res.json();
    console.log("Respuesta servidor:", data);
    alert("Archivo subido correctamente");

  } catch (err) {
    console.error(err);
    alert("No se pudo subir el archivo");
  }
});
