useEffect(() => {
  const base = import.meta.env.BASE_URL // "/kainrax/canonar/"
  fetch(`${base}registry.json`, { cache: 'no-store' })
    .then(r => r.json())
    .then(setReg)
}, [])
