'use client'

import Camera from "@/components/Camera";

const App = () => {
      return (
            <main className="w-screen h-screen overflow-hidden bg-zinc-950 flex items-center justify-center">
                  <div className="w-[390px] h-[844px] landscape:w-[844px] landscape:h-[390px] relative overflow-hidden transition-all duration-300">
                        <Camera />
                  </div>
            </main>
      )
}

export default App;