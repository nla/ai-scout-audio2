
  let chatHistory = {interviewId: "unknown", rounds: []} ;

	function showMsg(msg) {	
		console.log("showMsg " + msg) ;
    alert("msg: " + msg) ;
	}
	

  async function chat() {

    let user = document.getElementById("q").value ;
    if (!user) {
      showMsg("please enter a query on the transcript") ;
      return ;
    }

    // add a new round with the latest text

    chatHistory.rounds.push({user: user}) ;

    chatHistory.chatMode = (document.getElementById('chatty').checked) ? "chatty" : "findRefs" ;

    document.getElementById("chat").disabled = true ;
		try {

			const response = await fetch("/chat/interview", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(chatHistory)
			});
	
			const result = await response.json() ;
			console.log("POST result " + result + " : " + ((result) ? JSON.stringify(result) : "")) ;
			if (result.ok) {
        let lastRound = chatHistory.rounds[chatHistory.rounds.length - 1] ;
            
        lastRound.assistant = result.response ;

        let table = document.getElementById("chatHistory") ;
        let lastRow = table.insertRow(-1) ;
        lastRow.style.verticalAlign = "top";
        let c = lastRow.insertCell(0) ;
        c.style.verticalAlign = "top" ;
        c.style.width = "10em" ;
        c.innerHTML = "<B>You</B>" ;        

        lastRow.insertCell(1).innerHTML = "<B>" + lastRound.user + "</B>";
        lastRow = table.insertRow(-1) ;
        
        c = lastRow.insertCell(0) ;
        c.style.verticalAlign = "top" ;
        c.innerHTML = "Assistant" ;
        lastRow.insertCell(1).innerHTML = lastRound.assistant.trim().replaceAll("\n", "<BR/>") ;

        document.getElementById("q").value = "" ;

			}
			else throw Error("Chat failed: " + ((result) ? JSON.stringify(result) : "Unknown error")) ;
		} 
		catch (error) {
      showMsg("Chat error: " + error) ;
			console.error("POST Error:", error) ;
		}	
    document.getElementById("chat").disabled = false ;
  }

	window.addEventListener("load", async (event) => {
		console.log("chat load event running") ;

    let t = window.location.href ;  // ?id=nla.obj-201997740
    let i = t.indexOf("id=") ;
    if (i > 0) {
      t = t.substring(i+3) ;
      i = t.indexOf("&") ;
      if (i > 0) t = t.substring(0, i) ;
      i = t.indexOf("#") ;
      if (i > 0) t = t.substring(0, i) ;
      console.log("setting interview id to " + t) ;
      chatHistory.interviewId = t ;      
    }

    let initQ = document.getElementById("q").value ;

    console.log("chat ele is " +  document.getElementById("chat")) ;

    document.getElementById("chat").addEventListener("click", chat) ;


    document.getElementById("clearChat").addEventListener("click", function(event) {
      chatHistory.rounds = [] ;
      let table = document.getElementById("chatHistory") ;
      let lastRow = table.insertRow(-1) ;
      lastRow.style.verticalAlign = "top";
      let c = lastRow.insertCell(0).innerHTML = "<I>Chat reset</I>";


    }) ;
    

    document.getElementById("q").addEventListener("keypress", function(event) {
      if (event.key === "Enter") {
        event.preventDefault() ;
        document.getElementById("chat").click() ;
      }
    }); 
	}) ;
